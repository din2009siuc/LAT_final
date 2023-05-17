const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const configGet = require('config');
const fs = require('fs');

const key = configGet.get("FORM_RECOGNIZER_API_KEY");
const endpoint = configGet.get("FORM_RECOGNIZER_ENDPOINT");

const formUrl = "https://raw.githubusercontent.com/din2009siuc/LAT_final/main/report.pdf"
const file = fs.createReadStream("./report.pdf");

async function main() {
	const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));

	// const poller = await client.beginAnalyzeDocumentFromUrl("prebuilt-document", formUrl);
	const poller = await client.beginAnalyzeDocument("prebuilt-document", file)

	const {keyValuePairs} = await poller.pollUntilDone();
	/*
	const {
		pages, // pages extracted from the document, which contain lines and words
		tables, // extracted tables, organized into cells that contain their contents
		styles, // text styles (ex. handwriting) that were observed in the document
		keyValuePairs, // extracted pairs of elements  (directed associations from one element in the input to another)
		// entities, // extracted entities in the input's content, which are categorized (ex. "Location" or "Organization")
		documents // extracted documents (instances of one of the model's document types and its field schema)
	} = await poller.pollUntilDone();
	const [{ fields: receipt }] = documents;
	*/

	if (!keyValuePairs || keyValuePairs.length <= 0) {
		console.log("No key-value pairs were extracted from the document.");
	} else {
		console.log("Key-Value Pairs:");
		for (const {key, value, confidence} of keyValuePairs) {
			console.log("- Key  :", `"${key.content}"`);
			console.log("  Value:", `"${(value && value.content) || "<undefined>"}" (${confidence})`);
		}
	}

	// console.log("The type of this receipt is:", receipt?.["ReceiptType"]?.value);

}

main().catch((error) => {
    console.error("An error occurred:", error);
    process.exit(1);
});
