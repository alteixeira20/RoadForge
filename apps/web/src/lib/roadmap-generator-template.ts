export const ROADMAP_GENERATOR_TEMPLATE = `# RoadForge Roadmap Generator Template

Create a RoadForge JSON file that can be imported into RoadForge.

Use this template with a text-generation or planning tool, then produce a final .json file for RoadForge.

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
  "tagRegistry": [
    {
      "id": "planning",
      "label": "Planning",
      "color": "#f5853f"
    }
  ],
  "phases": [
    {
      "id": "phase-01",
      "num": "01",
      "name": "Foundation",
      "color": "#f5853f",
      "colorMode": "manual",
      "status": "active",
      "progress": 50,
      "tasks": [
        {
          "id": "RF-101",
          "title": "Define MVP scope",
          "done": true,
          "next": false,
          "est": "1 day",
          "tags": ["planning"],
          "assignees": ["Alex"],
          "deps": [],
          "desc": "Write the **scope** that guides the first build.\\n\\n- [x] Capture constraints\\n- [ ] Confirm acceptance criteria"
        },
        {
          "id": "RF-102",
          "title": "Draft implementation plan",
          "done": false,
          "next": true,
          "est": "2 days",
          "tags": ["planning"],
          "assignees": ["Alex", "Sam"],
          "deps": ["RF-101"],
          "desc": "Convert scope into sequenced work and link to [supporting context](https://example.com).",
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
- Top-level tagRegistry entries define stable tag IDs, labels, and optional #rrggbb colors.
- Task tags reference tagRegistry IDs. Task assignees are names in an assignees array.
- desc supports Markdown paragraphs, bold, italic, inline code, links, lists, and checkboxes, up to 5000 characters.
- Optional task fields: next, est, tags, assignees, deps, desc, parentId.
- Use double quotes and do not include trailing commas.
- Do not include session tokens, invite tokens, passwords, auth cache, or browser storage data.

## Final output instruction

Return only the final JSON. Do not wrap it in Markdown. Do not include comments.
`
