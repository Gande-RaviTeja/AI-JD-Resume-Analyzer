require('dotenv').config()
const app = require('./src/app')
const connectToDb = require('./src/config/database')
const { initializeGeminiAI, generateInterviewReport } = require('./src/services/ai.service')
const { resume, selfDescription, jobDescription } = require('./src/services/temp')

connectToDb();

(async () => {
    const aiReady = await initializeGeminiAI();

    if (!aiReady) {
        console.warn("⚠ Server started without Gemini AI.");
        return;
    }

    const result = await generateInterviewReport(
        resume,
        jobDescription,
        selfDescription
    );

    console.log(JSON.stringify(result, null, 2));
})();

const PORT = process.env.PORT || 3200;

app.listen(PORT, () => {
    console.log(`server is running on port ${PORT}`);
})
