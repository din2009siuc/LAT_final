//儲存時一並識別並輸出成JSON
'use strict';

const line = require('@line/bot-sdk'),
    express = require('express'),
    configGet = require('config'),
	fs = require('fs'),
	{ AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer"),
	{ exec } = require('child_process');

// Line config
const configLine = {
    channelAccessToken: configGet.get("CHANNEL_ACCESS_TOKEN"),
    channelSecret: configGet.get("CHANNEL_SECRET")
};
// Azure Form Recognizer config
const endpoint = configGet.get("ENDPOINT");
const apiKey = configGet.get("FORM_RECOGNIZER_API_KEY");

const client = new line.Client(configLine);

const app = express();
const port = process.env.PORT || process.env.port || 3001;

const fileFolder = 'saved_images/';
fs.mkdir(fileFolder, {recursive: true}, (err) => {
	if ( err ) throw err;
});

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


// 呼叫 Azure Form Recognizer
// 可以識別圖片檔、PDF檔
async function performFormRecognition(filePath) {
    console.log("Converting...");

    const recognizerClient = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));

    const poller = await recognizerClient.beginAnalyzeDocument("prebuilt-document", fs.readFileSync(filePath));
    const { content, pages } = await poller.pollUntilDone();

    // toTxt
    let lineResult = "";
    // toJSON
    let output = {};

    try {
        // 讀取現有的 output.json 內容
        const existingData = fs.readFileSync(outputFilePathJSON, 'utf8')
		if (existingData) {
			output = JSON.parse(existingData);
		} else {
			output = { pages: [] };
		}
    } catch ({name, msg}) {
		fs.closeSync(fs.openSync(outputFilePathJSON, 'w'));
		output = { pages:[] };
		// console.log(`Error reading existing data from ${outputFilePathJSON}:`, msg);
	}
	
    if (pages.length <= 0) {
        console.log("No pages were extracted from the document.");
    } else {
        console.log("Pages:");
        for (const page of pages) {
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
                // toJSON
                output.pages.push({
                    pageNumber: page.pageNumber,
                    unit: page.unit,
                    width: page.width,
                    height: page.height,
                    angle: page.angle,
                    // lines: lines
                    content: lineResult
                });

            }
        }
        // // toTxt
        // const outputFilePath = `output.txt`;
        // await writeToFile(lineResult, outputFilePath);
        // toJSON
		return output;
		/*
        await writeToFile(JSON.stringify(output), outputFilePathJSON);
        console.log("File has been written successfully.");
		*/
    }
}

// 處理接收到的 LINE 訊息
async function handleEvent(event) {
    if (event.message.type === 'image') {
        const messageContent = await client.getMessageContent(event.message.id);
        const filePath = `${fileFolder}${event.message.id}.jpg`;

        // 儲存圖片到本地
        const writableStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            messageContent.pipe(writableStream);
            writableStream.on('finish', resolve);
            writableStream.on('error', reject);
        });

        // client.replyMessage只能回傳一次訊息
		/*
        const replyMessage = { type: 'text', text: '圖片已儲存' };
       	client.replyMessage(event.replyToken, replyMessage);
		*/

        // 圖片轉文字
        performFormRecognition(filePath)
		.then( (outputJSON) => {
			writeToFile(JSON.stringify(outputJSON), outputFilePathJSON);
			console.log("File has been written successfully.");

			exec('python3 compare.py', (error, stdout, stderr) => {
				if ( error ) {
					console.error(`error: ${error}`);
					return;
				}
				const testMsg = { type: 'text', text: stdout };
				client.replyMessage(event.replyToken, testMsg);
			});
		});

    } else if (event.message.type === 'text') {
        // 回傳output.json的內容
		/*
        const outputFilePathJSON = `output.json`;
        const jsonData = fs.readFileSync(outputFilePathJSON, 'utf8');
        const output = JSON.parse(jsonData);

        const lines = output.pages[0].lines;
		*/

        const replyMessage = { type: 'text', text: 'HELLO' };
        client.replyMessage(event.replyToken, replyMessage);
    }
}

app.listen(port, () => {
    console.log(`App is listening on port ${port}`);
});
