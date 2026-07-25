# Visible control inventory

This inventory records the user outcome and access behavior of RoadForge's visible
controls. It is the reference for deciding whether a control is essential,
contextual, advanced, duplicated, deferred, or removable. Controls that only
appear in a relevant state are not dead controls.

## Classification

- **Essential** — a primary creation, navigation, editing, or recovery outcome.
- **Contextual** — useful only for a particular view, role, or roadmap state.
- **Advanced** — a less frequent but necessary portability, collaboration, or
  maintenance outcome.
- **Removable** — duplicated, misleading, dead, or promising an unavailable
  feature.

The explicit phase, task, and subtask move-arrow buttons met the removable
definition because they duplicated the accessible drag interaction and created
uneven rows. Ordering now uses drag handles only. RoadForge does not expose
deferred account, API, agent, webhook, billing, or PDF actions. The retained
contextual and advanced controls below are required for local-first portability,
collaboration, or recovery.

## Landing and global navigation

| Control | Class | User outcome | Availability and accessible name |
| --- | --- | --- | --- |
| RoadForge brand | Essential | Return to the landing page | All users; linked brand name |
| How it works / Features | Contextual | Jump to product explanation | Landing page; visible link text |
| Help | Essential | Open the task-based user guide | Landing and workspace; “Help” / “Help and user guide” |
| Source | Contextual | Inspect the source repository | Landing; visible “Source” text |
| Create roadmap | Essential | Start the blank/template creation flow | Landing; visible button text |
| Open saved roadmaps | Essential | Open, join, rename, or remove a local entry | Shown when local entries exist; labelled switcher |
| Report a problem | Essential | Open the private-data-safe GitHub issue chooser | Footer and Help; visible report wording |

## Workspace header

| Control | Class | User outcome | Availability and accessible name |
| --- | --- | --- | --- |
| Import / Export | Advanced | Move a portable roadmap into or out of RoadForge | Local, owner, and editor workspaces; “Import / Export” |
| Save | Essential | Promote a local roadmap to a shared server roadmap | Local editable roadmap; “Save to RoadForge” |
| Share | Contextual | Manage collaboration links | Synced owner only; visible “Share” text |
| Retry / Review | Essential | Retry an offline save or review a failed save | Failed/offline editable sync; state-specific accessible name |
| Reload | Essential | Resolve a server conflict by loading its version | Conflicted editable sync; “Reload server version” |
| Create your own | Essential | Leave a read-only roadmap for an independent local copy | Viewer only; visible button text |
| Roadmap switcher | Essential | Change, join, rename, or remove roadmap entries | All workspaces; labelled menu trigger |

## Workspace views and roadmap tools

| Control | Class | User outcome | Availability and accessible name |
| --- | --- | --- | --- |
| Roadmap | Essential | View phases and tasks | All roles; “Roadmap” in the “Workspace views” navigation |
| Activity | Contextual | Review attributed synced changes | Synced roadmaps; disabled local state explains when it becomes available |
| Tags | Advanced | Inspect or maintain the roadmap tag registry and usage | All roles; mutations follow edit permissions; “Tags” tab in the “Workspace views” navigation |
| Team | Contextual | Review participant access and task ownership | Owner/editor when available; visible “Team” text |
| Versions | Advanced | Create checkpoints and restore prior versions | Authorized synced roles; visible “Versions” text |
| Add phase | Essential | Append and immediately edit a phase | Local, owner, and editor in Roadmap view; end-of-list and zero-phase actions |
| Search | Essential | Find matching tasks, phases, tags, or people | All roles in Roadmap view; “Search roadmap tasks” |
| Filters | Contextual | Narrow by status, assignee, tag, phase, claim, or recommendation | All roles; labelled trigger, fields, removable chips, and clear action |
| Collapse all / Expand all | Contextual | Change phase disclosure without editing data | Unfiltered Roadmap view; visible state-specific text |

## Phases and tasks

| Control | Class | User outcome | Availability and accessible name |
| --- | --- | --- | --- |
| Phase disclosure | Essential | Show or hide a phase's tasks | All roles; phase-labelled disclosure button |
| Phase reorder | Contextual | Change phase order | Local, owner, and editor in an unfiltered roadmap; drag handle supports pointer, touch, and dnd-kit keyboard drag |
| Phase settings | Advanced | Rename, recolor, change color mode, or delete a phase | Local, owner, and editor; phase-labelled menu with keyboard dismissal/focus return |
| Add task / Add first task | Essential | Create work in a phase | Local, owner, and editor; visible text, including empty-phase recovery |
| Task completion | Essential | Toggle whether work is done | Local, owner, and editor when not locked; task-labelled checkbox |
| Task disclosure | Essential | Inspect or edit task details | All roles; task-labelled disclosure control |
| Task reorder | Contextual | Change task order | Local, owner, and editor in an unfiltered, collapsed task list; drag handle supports pointer, touch, and dnd-kit keyboard drag |
| Subtask reorder | Contextual | Change subtask order | Local, owner, and editor in an expanded task; drag handle supports pointer, touch, and dnd-kit keyboard drag |
| Task edit actions | Essential | Change title, status, details, links, dependencies, subtasks, tags, and assignment | Local, owner, and editor subject to locks; labelled form controls |
| Claim / release claim | Contextual | Signal active ownership of a task | Eligible synced participants; visible state-specific wording |
| Delete task | Advanced | Remove a task after an accurate confirmation | Local, owner, and editor; visible destructive wording and keyboard-safe dialog |

## Empty, restricted, and recovery states

| Control | Class | User outcome | Availability and accessible name |
| --- | --- | --- | --- |
| Create first phase | Essential | Recover a genuinely zero-phase roadmap | Local, owner, and editor; visible action; viewer receives an explanation only |
| Add another phase | Essential | Continue after the final phase | Local, owner, and editor; visible action |
| Reset filters | Essential | Recover from a filtered-empty result | All roles; visible reset wording |
| Add first task | Essential | Recover an empty phase | Local, owner, and editor; viewer receives an explanation only |
| Delete confirmations | Essential | Understand contained work before destructive phase/task removal | Authorized editors; Cancel and explicit destructive action, with focus containment/return |
| Keep local / Use server | Advanced | Preserve a draft or resolve a stale-write conflict | Conflict state; explicit recovery wording |
| Lock recovery | Advanced | Retry, resume, or safely leave an edit after lock loss | Synced editing conflicts; state-specific instructions and actions |

## Retention decision

The review removed duplicate move-arrow actions while retaining their user
outcome through drag handles and dnd-kit's Space → Arrow → Space keyboard
interaction. Primary creation and recovery actions remain visible without hover.
Advanced controls remain state-scoped: import/export preserves portability,
the Tags view preserves roadmap validity, versions and activity preserve
audit/recovery, and phase settings hold structural actions that should not
compete with “Add phase.”

Future removals require both a confirmed absent user outcome and focused
regression coverage. Parked post-Beta capabilities must not gain controls until
their product decisions are reopened.
