# AI JD & Resume Analyzer (Telegram HR Bot)

A professional AI assistant for Telegram designed to streamline HR recruiting, candidate evaluation, and resume screening.

---

##  Live Services

*  **Telegram Bot**: [@rt_resume_bot](https://t.me/rt_resume_bot)
*  **Render Web Service**: [ai-jd-resume-analyzer.onrender.com](https://ai-jd-resume-analyzer.onrender.com)
  <p align="center">
  <strong>Use the server to start bot</strong>
</p>
                  

---

##  Purpose & Use Cases

This bot helps HR teams and recruiters automate candidate screening and resume evaluation directly inside Telegram:

* **Automated ATS Scoring**: Automatically grades resumes (0–100) based on job requirements, experience, and skill match.
* **Skill Gap Identification**: Highlights missing required and optional skills for every candidate.
* **Multi-Format Processing**: Extracts data seamlessly from **PDF**, **DOCX**, and **TXT** resume files.
* **Smart HR Assistant**: Answers free-text questions about candidates (e.g., *"Which candidates know React?"*, *"What is candidate X's email?"*).
* **Role-Based Ranking**: Ranks all candidates in a clean leaderboard for quick hiring decisions.

---

##  How to Use the Bot (Step-by-Step)

1. **Start the Bot**: Open [@rt_resume_bot](https://t.me/rt_resume_bot) on Telegram and send `/start`.
2. **Add a Job Description**:
   * Send `/newjd`
   * Paste the job description text or upload a JD document.
3. **Upload Candidate Resumes**:
   * Send `/uploadresumes`
   * Upload candidate PDF/DOCX resumes (or paste resume text). The bot automatically evaluates each resume against your active Job Description.
4. **View Candidate Rankings**:
   * Send `/rank` to get an instant ranked summary of candidates sorted by ATS match score.
5. **Ask Free-Text HR Questions**:
   * Type any question in chat, such as:
     * *"Show contact details for all candidates."*
     * *"Who has experience with Python or C++?"*
     * *"List candidates missing Next.js skills."*

---

##  Bot Commands Reference

| Command | Action |
| :--- | :--- |
| `/start` | Launch the bot and view setup instructions |
| `/newjd` | Add a new Job Description (text or document) |
| `/uploadresumes` | Enter resume collection mode for the active JD |
| `/listjds` | View all saved Job Descriptions and candidate counts |
| `/switchjd <n>` | Select an active Job Description by index number |
| `/rank` | Display candidate rankings and ATS match scores |
| `/reset` | Clear session data and reset state |

---




