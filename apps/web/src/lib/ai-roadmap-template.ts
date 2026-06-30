export const AI_ROADMAP_TEMPLATE = `# RoadForge AI Roadmap Template

Create an RoadForge JSON file that can be imported into RoadForge.

Use this template to gather context, then produce a final .json file for RoadForge.

## Fill in

Project name:

Product goal:

Existing completed work:

Pending features:

Deployment target:

Constraints:

Preferred phases:

Priority rules:

## Valid schema example

\`\`\`json
{
  "schema": "anvilary.roadmap.import",
  "version": 1,
  "roadmap": {
    "name": "Example Roadmap"
  },
  "phases": [
    {
      "id": "phase-01",
      "num": "01",
      "name": "Foundation",
      "color": "#f5853f",
      "status": "active",
      "progress": 25,
      "tasks": [
        {
          "id": "RF-101",
          "title": "Define MVP scope",
          "done": true,
          "next": false,
          "est": "1 day",
          "tags": ["planning"],
          "deps": [],
          "desc": "Write the scope that guides the first build."
        },
        {
          "id": "RF-102",
          "title": "Draft implementation plan",
          "done": false,
          "next": true,
          "est": "2 days",
          "tags": ["planning"],
          "deps": ["RF-101"],
          "desc": "Convert scope into sequenced work.",
          "parentId": "RF-101"
        }
      ]
    }
  ]
}
\`\`\`

## RoadForge constraints

- Status values: done, active, next, future.
- Progress must be a number from 0 to 100.
- Task IDs should be stable and readable, for example RF-101.
- Dependencies use task IDs in deps.
- Subtasks use parentId set to another task ID.
- Optional task fields: next, est, tags, deps, desc, parentId.
- Use double quotes and do not include trailing commas.
- Do not include session tokens, invite tokens, passwords, auth cache, or browser storage data.

## Final AI instruction

Return only the final JSON. Do not wrap it in Markdown. Do not include comments.
`
