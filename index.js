const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const configGet = require('config');

  // set `<your-key>` and `<your-endpoint>` variables with the values from the Azure portal.
  const key = configGet.get("FORM_RECOGNIZER_API_KEY");
  const endpoint = configGet.get("FORM_RECOGNIZER_ENDPOINT");

  // sample document
  const formUrl = "https://raw.githubusercontent.com/Azure-Samples/cognitive-services-REST-api-samples/master/curl/form-recognizer/sample-layout.pdf"

  async function main() {
    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));

    const poller = await client.beginAnalyzeDocumentFromUrl("prebuilt-document", formUrl);

    const {keyValuePairs} = await poller.pollUntilDone();

    if (!keyValuePairs || keyValuePairs.length <= 0) {
        console.log("No key-value pairs were extracted from the document.");
    } else {
        console.log("Key-Value Pairs:");
        for (const {key, value, confidence} of keyValuePairs) {
            console.log("- Key  :", `"${key.content}"`);
            console.log("  Value:", `"${(value && value.content) || "<undefined>"}" (${confidence})`);
        }
    }

}

main().catch((error) => {
    console.error("An error occurred:", error);
    process.exit(1);
});
