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
const imgPath = './public/' + imgFolder;
fs.mkdir(imgFolder, {recursive: true}, (err) => {
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

async function readdirPromise(folder) {
	return new Promise((resolve, reject) => {
		fs.readdir(folder, (err, filenames) => {
			if ( err ) reject(err);
			else resolve(filenames);
		});
	});
}

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

function replyHelp(event) {
	client.replyMessage(event.replyToken, {
		type: 'text',
		text: 'HELP MESSAGE'
	});
}

// 處理接收到的 LINE 訊息
async function handleEvent(event) {
    if (event.message.type === 'image') {
        const messageContent = await client.getMessageContent(event.message.id);
        const filePath = `${imgPath}/${event.message.id}.jpg`;

        // 儲存圖片到本地
        const writableStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            messageContent.pipe(writableStream);
            writableStream.on('finish', resolve);
            writableStream.on('error', reject);
        });

        // client.replyMessage只能回傳一次訊息
		// 讀取現有的 output.json 內容
		let exJSON = {};
		try {
			const existingData = fs.readFileSync(outputFilePathJSON, 'utf8')
			if (existingData) {
				exJSON = JSON.parse(existingData);
			} else {
				exJSON = { pages: [] };
			}
		} catch ( { name, msg } ) {
			fs.closeSync(fs.openSync(outputFilePathJSON, 'w'));
			exJSON = { pages:[] };
		}
		

        // 圖片轉文字
        performFormRecognition(filePath)
		.then( (outputJSON) => {
			for ( const page of exJSON.pages ) {
				if ( page.content === outputJSON.content ) {
					console.log("Content already exist.");
					client.replyMessage(event.replyToken, {
						type: 'text',
						text: '已上傳過（內容）相同的檔案。'
					});
					return;
				}
			}
			if ( outputJSON ) {
				exJSON.pages.push(outputJSON);
				writeToFile(JSON.stringify(exJSON), outputFilePathJSON);
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
				fs.readdir(imgPath, (err, files) => {
					if ( err ) {
						console.log(err);
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

				findJPG(imgPath, words[1])
				.then((file) => {
					const replyImgPath = base_url + '/' + imgFolder + '/' + file;
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
				})
				.catch((err) => {
					client.replyMessage(event.replyToken, {
						type: 'text',
						text: '找不到此名稱的圖片: ' + words[1]
					});
				});
				break;

			case 'mv':
				console.log('Get command \'mv\'');
				if ( words.length < 3 ) {
					replyHelp(event);
					break;
				}

				if ( words[1].substring(words[1].length-4) !== '.jpg' ) words[1] += '.jpg';
				if ( fs.existsSync(imgPath+words[1])) {
					if ( words[2].substring(words[2].length-4) !== '.jpg' ) words[2] += '.jpg';
					if ( fs.existsSync(imgPath+words[2]) ) {
						replyText = `失敗，已存在名稱為 \'${words[2]}\' 的圖片。`;
					} else {
						fs.rename(imgPath+words[1], imgPath+words[2], err => {
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
				if ( fs.existsSync(imgPath+words[1]) ) {
					fs.rm(imgPath+words[1], err => {
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
