const express = require('express')
const router = express.Router()
const { verifyToken, requirePMOrAbove } = require('../middleware/auth')

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`

async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// POST /api/ai/extract-action-items
router.post('/extract-action-items', verifyToken, requirePMOrAbove, async (req, res) => {
  const { notes, attendees } = req.body
  if (!notes) return res.status(400).json({ error: 'Meeting notes are required' })
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'AI service not configured' })

  try {
    const prompt = `You are a project coordinator assistant. Extract all action items from the following meeting notes.

Meeting Notes:
${notes}

${attendees ? `Attendees: ${attendees}` : ''}

Return a JSON array of action items. Each item must have:
- "title": the action to be done (clear, concise)
- "assigned_to_name": person responsible (use name from notes, or "Unassigned" if unclear)
- "due_date": date in YYYY-MM-DD format if mentioned, otherwise null
- "classification": one of "issue", "new_requirement", "change_request", "tbd"

Return ONLY valid JSON array, no explanation, no markdown code blocks.
Example: [{"title":"Set up staging server","assigned_to_name":"John","due_date":"2025-08-01","classification":"new_requirement"}]`

    const text = await callGemini(prompt)
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const items = JSON.parse(cleaned)
    if (!Array.isArray(items)) throw new Error('Invalid response format')
    res.json({ items })
  } catch (err) {
    console.error('AI extract error:', err.message)
    if (err instanceof SyntaxError) return res.status(500).json({ error: 'AI returned malformed data. Try rephrasing your notes.' })
    res.status(500).json({ error: err.message || 'AI extraction failed. Please try again.' })
  }
})

// POST /api/ai/meeting-summary
router.post('/meeting-summary', verifyToken, requirePMOrAbove, async (req, res) => {
  const { title, date, attendees, venue, duration, objective, discussionPoints } = req.body
  if (!title || !discussionPoints) return res.status(400).json({ error: 'Meeting title and discussion points are required' })
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'AI service not configured' })

  try {
    const prompt = `You are a professional business analyst. Generate a formal Minutes of Meeting (MoM) summary from the notes below.

Meeting Details:
Title: ${title}
Date: ${date}
Attendees: ${attendees || 'Not specified'}
Venue/Duration: ${[venue, duration].filter(Boolean).join(' | ') || 'Not specified'}
Objective: ${objective || 'Not specified'}

Raw Meeting Notes:
${discussionPoints}

Format the output EXACTLY as follows (use these exact section headers):

EXECUTIVE SUMMARY
Write 2-3 sentences summarising the meeting purpose and outcome.

KEY DISCUSSIONS
1. First discussion point
2. Second discussion point
3. (continue numbering for each topic)

KEY DECISIONS
1. First decision made
2. Second decision made
(If no clear decisions, write: No formal decisions recorded.)

Rules:
- Section headers must be in ALL CAPS on their own line
- Each point under a section must be numbered starting from 1
- Do not use markdown, asterisks, hyphens, or bullet symbols
- Do not include an Action Items section
- Keep each numbered point to one or two sentences
- Maximum 350 words total`

    const summary = await callGemini(prompt)
    res.json({ summary: summary.trim() })
  } catch (err) {
    console.error('AI summary error:', err.message)
    res.status(500).json({ error: err.message || 'AI summary generation failed. Please try again.' })
  }
})

// POST /api/ai/extract-from-summary
router.post('/extract-from-summary', verifyToken, requirePMOrAbove, async (req, res) => {
  const { summary, attendees } = req.body
  if (!summary) return res.status(400).json({ error: 'Summary text is required' })
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'AI service not configured' })

  try {
    const prompt = `You are a project coordinator assistant. Extract all action items from the following meeting summary.

Meeting Summary:
${summary}

${attendees ? `Attendees: ${attendees}` : ''}

Return a JSON array of action items. Each item must have:
- "title": the action to be done (clear, concise)
- "assigned_to_name": person responsible (use name from summary, or "Unassigned" if unclear)
- "due_date": date in YYYY-MM-DD format if mentioned, otherwise null

Return ONLY valid JSON array, no explanation, no markdown code blocks.
Example: [{"title":"Set up staging server","assigned_to_name":"John","due_date":"2025-08-01"}]`

    const text = await callGemini(prompt)
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const items = JSON.parse(cleaned)
    if (!Array.isArray(items)) throw new Error('Invalid response format')
    res.json({ items })
  } catch (err) {
    console.error('AI extract-from-summary error:', err.message)
    if (err instanceof SyntaxError) return res.status(500).json({ error: 'AI returned malformed data. Please try again.' })
    res.status(500).json({ error: err.message || 'AI extraction failed. Please try again.' })
  }
})

module.exports = router
