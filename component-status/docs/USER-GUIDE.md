# Component Status – User guide

Component Status is a Figma plugin. It reads the components of your library,
reads the JSON files from the iOS and Android teams, and draws a status table
on the canvas: which component is implemented, on which brand, on which
platform, and with which version.

## Install

1. Unzip the plugin folder.
2. In Figma desktop, open your library file.
3. Menu **Plugins → Development → Import plugin from manifest…** and choose
   `manifest.json` inside the folder.
4. Run **Plugins → Development → Component Status**.

You only do this once. Later, just run the plugin.

## The window

The plugin has three steps on one screen. Later steps unlock when the earlier
ones are done.

### Step 1 – Components

The plugin scans the file by itself when it opens. You see a counter and the
page it is scanning. When it finishes you see the list of components with
type and version.

- **Version** comes from the component name (for example `Button v2.3.0`) or
  from the description (`Version: v2.3.0`). Emojis are removed from names.
- **Type** is Atom or Component. It comes from the description (`Type: Atom`)
  or from the page / frame name.
- Pages named WIP, WIP Purple, File template assets, Annotations,
  Text Resizing & Landscape and Local components are skipped. A section named
  Organisational is skipped too.
- **Hide components without a version** is on by default. Untick it to see
  them.
- **Checkbox at the left of each row**: untick a component to leave it out
  of the table. Use **Include all** to reset. This is remembered.
- A yellow box lists duplicate names. The JSON value is used for every
  component with that name.

**Change log.** If you keep a change log table on the canvas, click
**Find in file**. The plugin reads every "Change log Row" (name, version,
status, description, "Published on" date). Old history written in the
component description as version lines is read too. **Clear** forgets it.

**Other library files.** To include components from another file (for
example the atoms library):

1. Click **Set token** and paste a Figma personal access token
   (Figma → Settings → Security → Personal access tokens, scope
   "File content: read"). The token stays on your computer.
2. Paste the file link and click **Add**.

Only published components of that file are listed. Links are remembered.

### Step 2 – Upload

Drop one JSON file per brand: **COBA** and **Purple**. Each file holds the
platforms inside. Three formats are accepted, also mixed:

```
"Badge": "v1.2.0"                                            plain
"Badge": "v1.2.0", // Figma: 66:1117; APIs: CocoBadge          with comments
"Badge": { "version": "v1.2.0", "componentId": "66:1117", "api": "CocoBadge" }
```

- `null` or a missing name = Not Started. `"n/a"` = Not applicable.
- A `generic` block counts for both platforms unless `ios` or `android`
  has its own entry.
- `updatedAt` (optional) is shown above the table. Without it the file
  date is used.

After both files are loaded you see:

- **Figma-IDs**: how many ids the files contain, how many were found, how
  many not. Open "Show the … not found" to see them. An id is valid only in
  the file it came from; if many are missing, link that file in step 1.
- **Names not found in the library**: a list with a dropdown per name.
  - Names with a working Figma-ID are mapped for you ("via Figma-ID").
  - Names that are 1:1 after cleaning (`DatePicker` = `Date Picker`) are
    mapped for you too.
  - Amber rows show a similar name. Click **Use** to accept it.
  - Everything else stays on **Ignore** until you choose a component.
- Every choice is saved in the Figma file at once.
- **Download mapping CSV** gives the dev team a table: JSON name, library
  component, match type, Figma id, code API, code file.
- **Import mapping CSV** reads such a table back, as a backup.
- **Re-apply Figma-IDs** replaces manual choices with the ids.

### Step 3 – Generate

Click **Generate table**. The table is placed on the current page. Running
it again replaces the old table in the same place.

Options:

- **Add change log sub-rows**: one line per version under each component.
- **Show the last N versions** (0 = all).

## Reading the table

| Symbol | Meaning |
| --- | --- |
| ● Implemented | the implemented version equals the library version |
| ◐ Update available, "on v1.2.0" | implemented, but an older version |
| ○ Not Started | no entry in the JSON |
| – Not applicable | the JSON says `n/a` |

Rows of components with "purple" in the name have a light purple background.
The caption at the top shows the update date of each brand file and the day
the table was generated. **Go to Component →** jumps to the component, also
in a linked file.

## Common questions

**A JSON name is not matched.** Check the Figma-ID list first. Then map it
by hand in step 2, or ask the dev team to rename it. The mapping CSV shows
what is missing.

**The table is empty or too small.** Check the checkboxes in step 1 and the
"Hide components without a version" option.

**The change log is not found.** Rows are found by the layer name
"Change log Row" or by having a "Version Table Cell" and a "Description
Table Cell". Use **Find in file**, or select the section and click
**Use selection**. The error message tells what was in the selection.

**A linked file shows "Access denied".** Check the token and that you can
open that file in Figma.
