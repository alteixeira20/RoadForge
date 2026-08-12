export const ROADMAP_GENERATOR_TEMPLATE = `# RoadForge Roadmap Generator Template

Create a RoadForge JSON file that can be imported into the current RoadForge application.
Use this template with a planning/text-generation tool, then return a final \`.json\` file.

## Project input

Project name:

Product goal:

Existing completed work:

Pending work:

Deployment target:

Constraints:

Preferred phases:

Priority rules:

## Current import schema example

\`\`\`json
{
  "schema": "roadforge.roadmap.import",
  "version": 2,
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
          "title": "Define the first release scope",
          "done": true,
          "recommended": false,
          "est": "1 day",
          "tags": ["planning"],
          "assignees": ["Alex"],
          "deps": [],
          "desc": "Write the **scope** that guides the first build.\\n\\n- [x] Capture constraints\\n- [ ] Confirm acceptance criteria"
        },
        {
          "title": "Draft the implementation plan",
          "done": false,
          "recommended": true,
          "est": "2 days",
          "tags": ["planning"],
          "assignees": ["Alex", "Sam"],
          "deps": ["1.1"],
          "desc": "Convert the scope into sequenced work and link supporting context where useful.",
          "parent": "1.1"
        }
      ]
    }
  ]
}
\`\`\`

## RoadForge constraints

- Use \`schema: "roadforge.roadmap.import"\` for newly generated import files.
- \`version\` is currently \`2\`.
- Phase \`status\` values are \`done\`, \`active\`, \`next\`, or \`future\`.
- Phase \`progress\` is a number from 0 to 100 and should reflect task completion.
- Do not create or edit task IDs. Task references are determined by roadmap order: \`1.1\`, \`1.2\`, \`2.1\`, with subtasks such as \`1.1.1\`.
- Dependencies reference those order-derived task numbers through \`deps\`.
- Subtasks use \`parent\` with the parent task's order-derived number.
- \`recommended: true\` means RoadForge recommends that task as a good next choice. It is guidance, not an authoritative or exclusive "next task", and more than one task may be recommended.
- \`tagRegistry\` defines stable tag IDs; task \`tags\` reference those IDs.
- Task \`assignees\` are planning labels and do not grant collaboration access.
- \`desc\` supports the Markdown subset accepted by RoadForge and is limited by the current parser/API contract.
- Optional task fields include \`recommended\`, \`est\`, \`tags\`, \`assignees\`, \`deps\`, \`desc\`, \`parent\`, and supported credential-free external links.
- Never include participant sessions, invite tokens, passwords, browser auth/cache metadata, database credentials, or private secrets.
- Use valid JSON with double quotes and no comments/trailing commas.

RoadForge remains backward-compatible with supported version 1 ID-based files and legacy
\`anvilary.*\` schema IDs, but new generator output should use this version 2 order-based format.

## Final output instruction

Return only the final JSON. Do not wrap it in Markdown. Do not include comments or prose.
`