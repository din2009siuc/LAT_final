//儲存時一並識別並輸出成JSON
'use strict';

const line = require('@line/bot-sdk'),
    express = require('express'),
    configGet = require('config'),
	fs = require('fs'),
	{ AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer"),
	{ exec } = require('child_process');

require('dotenv').config();

// Line config
const configLine = {
    channelAccessToken: configGet.get("CHANNEL_ACCESS_TOKEN"),
    channelSecret: configGet.get("CHANNEL_SECRET")
};
// Azure Form Recognizer config
const endpoint = configGet.get("ENDPOINT");
const apiKey = configGet.get("FORM_RECOGNIZER_API_KEY");

const imgFolder = 'saved_images/';
const imgFolderPath = './public/' + imgFolder;
fs.mkdir(imgFolderPath, {recursive: true}, (err) => {
	if ( err ) throw err;
});

const client = new line.Client(configLine);

let base_url = process.env.BASE_URL;

const app = express();
const port = process.env.PORT || process.env.port || 3001;

app.use(express.static(__dirname + '/public'));

const outputFilePathJSON = 'output.json';

// Set up the route to handle LINE messages
app.post('/callback', line.middleware(configLine), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// 轉為文字檔
async function writeToFile(content, filePath) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, content, 'utf8', (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

/*
async function findJPG(folder, target) {
	if ( target.substring(target.length-4) !== '.jpg' ) target += '.jpg';
	return new Promise((resolve, reject) => {
		fs.readdir(folder, (err, filenames) => {
			if ( err ) {
				reject(err);
			} else {
				let found = false;
				for ( const file of filenames ) {
					if ( file === target ) {
						resolve(file);
						found = true;
						break;
					}
				}
				if ( !found ) reject('No such file');
			}
		});
	});
}
*/


// 呼叫 Azure Form Recognizer
// 可以識別圖片檔、PDF檔
async function performFormRecognition(filePath) {
    console.log("Converting...");

    const recognizerClient = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));

    const poller = await recognizerClient.beginAnalyzeDocument("prebuilt-document", fs.readFileSync(filePath));
    const { content, pages } = await poller.pollUntilDone();

    let lineResult = "";

    if (pages.length <= 0) {
        console.log("No pages were extracted from the document.");
	} else if ( pages.length > 1 ) {
		console.log("Too many pages were extracted from the document(expect 1).");
    } else {
		const page = pages[0];
		console.log("- Page", page.pageNumber, `(unit: ${page.unit})`);
		console.log(`  ${page.width}x${page.height}, angle: ${page.angle}`);
		console.log(`  ${page.lines.length} lines, ${page.words.length} words`);

		if (page.lines.length > 0) {
			console.log("  Lines:");
			let lines = [];
			for (const line of page.lines) {
				let lineContent = "";
				for (const word of line.words()) {
					lineContent += word.content;
				}
				console.log(`  - "${lineContent}"`);
				// toTxt
				lineResult += lineContent;
				// toJSON
				lines.push(lineContent);
			}
		}
		return {
			name: filePath.substring(filePath.lastIndexOf("/")+1),
			pageNumber: page.pageNumber,
			unit: page.unit,
			width: page.width,
			height: page.height,
			angle: page.angle,
			// lines: lines
			content: lineResult
		};
    }
	return {};
}

function lcs(sA, sB) {
	let dp = Array(2);
	for ( var i=0; i<2; i++ ) dp[i] = Array(sB.length+1);
	for ( var j=0; j<sB.length+1; j++ ) dp[0][j] = 0;

	for ( var i=1; i<sA.length+1; i++ ) {
		dp[i%2][0] = 0;
		for ( var j=1; j<sB.length+1; j++ ) {
			if ( sA[i-1] === sB[j-1] ) {
				dp[i%2][j] = dp[(i-1)%2][j-1] + 1;
			} else {
				dp[i%2][j] = Math.max(dp[(i-1)%2][j], dp[i%2][j-1]);
			}
		}
	}
	return dp[sA.length%2][sB.length]
}

function replyHelp(event) {
	client.replyMessage(event.replyToken, {
		type: 'text',
		text: '使用說明：\n-\n' +
				'ls\n列出現存檔案名稱\n-\n' +
				'mv file1 file2\n將 file1 改名為 file2\n-\n' +
				'rm file1\n刪除 file1\n-\n' +
				'show file1\n顯示 file1 圖片\n-\n' +
				'上傳圖片：新增圖片至資料庫，並與舊有資料比對。'
	});
}

// 處理接收到的 LINE 訊息
async function handleEvent(event) {
    if (event.message.type === 'image') {
        const messageContent = await client.getMessageContent(event.message.id);

		// 儲存圖片到本地
		const filename = `${event.message.id}.jpg`;
		const filepath = `${imgFolderPath}/${filename}`
		const writableStream = fs.createWriteStream(filepath);
		await new Promise((resolve, reject) => {
			messageContent.pipe(writableStream);
			writableStream.on('finish', resolve);
			writableStream.on('error', reject);
		});

		// 讀取現有的 output.json 內容
		let pastJSON = {};
		try {
			const existingData = fs.readFileSync(outputFilePathJSON, 'utf8')
			if (existingData) {
				pastJSON = JSON.parse(existingData);
			} else {
				pastJSON = { pages: [] };
			}
		} catch ( { name, msg } ) {
			fs.closeSync(fs.openSync(outputFilePathJSON, 'w'));
			pastJSON = { pages:[] };
		}

        // 圖片轉文字
        performFormRecognition(filepath)
		.then( (outputJSON) => {
			for ( const page of pastJSON.pages ) {
				if ( page.content === outputJSON.content ) {
					console.log("Content already exist.");
					fs.rm(filepath, err => {
						if ( err ) throw err;
						console.log(`removed (duplicated) file ${filepath}`)
					});
					client.replyMessage(event.replyToken, {
						type: 'text',
						text: '已上傳過（內容）相同的檔案。'
					});
					return;
				}
			}

			let replyMsg = [];

			replyMsg.push({
				type: 'text',
				text: `已儲存圖片為 ${filename}。`
			});

			// 將此文檔與過去其他文檔比對
			if ( pastJSON.pages.length < 1 ) {
				replyMsg.push({
					type: 'text',
					text: '無歷史文檔可供比對。'
				});
				client.replyMessage(event.replyToken, replyMsg);
				// 儲存至json
				pastJSON.pages.push(outputJSON);
				writeToFile(JSON.stringify(pastJSON), outputFilePathJSON);
				return;
			}

			const delims = /[！？。!?\n]+/;
			const MIN_LEN = 7;
			const compareResults = [];
			if ( outputJSON ) {
				const newSentences = outputJSON.content.split(delims);
				for ( const page of pastJSON.pages ) {
					const pastSentences = page.content.split(delims);
							
					for ( const newSentence of newSentences ) {
						if ( newSentence.length < MIN_LEN ) continue;
						for ( const pastSentence of pastSentences ) {
							if ( pastSentence.length < MIN_LEN ) continue;
							const rat = lcs(newSentence, pastSentence) / Math.max(newSentence.length, pastSentence.length);
							if ( rat > 0.8 ) compareResults.push({
								pastName: page.name,
								newS: newSentence,
								pastS: pastSentence,
								rat: rat
							});
						}
					}
				}
			}

			if ( compareResults.length === 0 ) {
				replyMsg.push({
					type: 'text',
					text: `在 ${pastJSON.pages.length} 筆歷史文檔中沒有找到相似的句子。`
				});
			} else {
				replyMsg.push({
					type: 'text',
					text: `與歷史文檔比對共找到 ${compareResults.length} 組相似的句子。其中最相似的 ${Math.min(3, compareResults.length)} 組為：`
				});

				compareResults.sort( (a, b) => {
					return a[rat] > b[rat];
				});

				for ( var i=0; i<Math.min(3, compareResults.length); i++ ) {
					const res = compareResults[i];
					replyMsg.push({
						type: 'text',
						text: `此文檔：\n${res.newS}\n-\n${res.pastName}：\n${res.pastS}\n-\n相似度：${res.rat}`
					});
				}
			}

			client.replyMessage(event.replyToken, replyMsg);

			pastJSON.pages.push(outputJSON);
			writeToFile(JSON.stringify(pastJSON), outputFilePathJSON);

			/*
			if ( outputJSON ) {
				pastJSON.pages.push(outputJSON);
				writeToFile(JSON.stringify(pastJSON), outputFilePathJSON);
				console.log("File has been written successfully.");

				exec('python3 compare.py', (error, stdout, stderr) => {
					if ( error ) {
						console.error(`error: ${error}`);
						return;
					}
					client.replyMessage(event.replyToken, {
						type: 'text',
						text: stdout
					});
				});
			}
			*/
		});

    } else if (event.message.type === 'text') {
		console.log(`userID: ${event.source.userId}`);
		const words = event.message.text.toLowerCase().split(' ');
		if ( words.length < 1 ) {
			console.error('Get empty command');
		}
		let replyText;
		switch( words[0] ) {
			case 'ls':
				console.log('Get command \'ls\'');
				fs.readdir(imgFolderPath, (err, files) => {
					if ( err  || files.length === 0) {
						client.replyMessage(event.replyToken, {
							type: 'text',
							text: '暫無檔案可供讀取'
						});
						console.error(err);
						return;
					}
					client.replyMessage(event.replyToken, {
						type: 'text',
						text: files.join('\n')
					});
				});
				break;

			case 'show':
				console.log('Get command \'show\'');
				if ( words.length < 2 ) {
					replyHelp(event);
					break;
				}

				if ( words[1].substring(words[1].length-4) !== '.jpg' ) words[1] += '.jpg';
				if ( fs.existsSync(imgFolderPath+words[1])) {
					const replyImgPath = base_url + '/' + imgFolder + '/' + words[1];
					return client.replyMessage(event.replyToken, [
					{
						type: 'text',
						text: `圖片\'${words[1]}\'內容為下`
					},
					{
						'type': 'image',
						'originalContentUrl': replyImgPath,
						'previewImageUrl': replyImgPath
					}
					]);
				} else {
					client.replyMessage(event.replyToken, {
						type: 'text',
						text: `失敗，找不到名稱為 \'${words[1]}\' 的圖片。`
					});
				}
				break;

			case 'mv':
				console.log('Get command \'mv\'');
				if ( words.length < 3 ) {
					replyHelp(event);
					break;
				}

				if ( words[1].substring(words[1].length-4) !== '.jpg' ) words[1] += '.jpg';
				if ( fs.existsSync(imgFolderPath+words[1])) {
					if ( words[2].substring(words[2].length-4) !== '.jpg' ) words[2] += '.jpg';
					if ( fs.existsSync(imgFolderPath+words[2]) ) {
						replyText = `失敗，已存在名稱為 \'${words[2]}\' 的圖片。`;
					} else {
						//改output.json中的名字
						let pastJSON = JSON.parse(fs.readFileSync(outputFilePathJSON, 'utf8'));
						for ( const page of pastJSON.pages ) {
							if ( page.name === words[1] ) page.name = words[2];
							break;
						}
						writeToFile(JSON.stringify(pastJSON), outputFilePathJSON);
						//改saved_image中的名字
						fs.rename(imgFolderPath+words[1], imgFolderPath+words[2], err => {
							if ( err ) throw err;
							console.log('file renamed!');
						});
						replyText = `成功，已將圖片 \'${words[1]}\' 更名為 \'${words[2]}\' 。`;
					}
				} else {
					replyText = `失敗，找不到名稱為 \'${words[1]}\' 的圖片。`;
				}
				client.replyMessage(event.replyToken, {
					type: 'text',
					text: replyText
				});
				break;

			case 'rm':
				console.log('Get command \'rm\'');
				if ( words.length < 2 ) {
					replyHelp(event);
					break;
				}

				if ( words[1].substring(words[1].length-4) !== '.jpg' ) words[1] += '.jpg';
				if ( fs.existsSync(imgFolderPath+words[1]) ) {
					//刪除 output.json 中的資料
					let pastJSON = JSON.parse(fs.readFileSync(outputFilePathJSON, 'utf8'));
					for ( const page of pastJSON.pages ) {
						if ( page.name === words[1] ) pastJSON.pages = pastJSON.pages.filter( (ele) => {
							return ele != page;
						});
						break;
					}
					writeToFile(JSON.stringify(pastJSON), outputFilePathJSON);
					// 刪除 saved_image 中的圖片
					fs.rm(imgFolderPath+words[1], err => {
						if ( err ) throw err;
						console.log('file removed!');
					})
					replyText = `已成功刪除圖片 \'${words[1]}\'。`;
				} else {
					replyText = `失敗，找不到名稱為 \'${words[1]}\' 的圖片。`;
				}
				client.replyMessage(event.replyToken, {
					type: 'text',
					text: replyText
				});
				break;

			default:
				replyHelp(event);
		}
    }
}

app.listen(port, () => {
    console.log(`App is listening on port ${port}`);
});
