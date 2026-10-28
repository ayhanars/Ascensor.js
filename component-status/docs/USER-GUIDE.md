# Component Status – How to use

Component Status reads the components of your library file, reads the JSON
files from the iOS and Android teams, and draws a status table on the canvas:
which component is implemented, on which brand, on which platform, and with
which version.

Open your library file, then run the plugin from **Plugins → Component
Status**. The window has three steps. Later steps unlock when the earlier
ones are done.

## Step 1 – Components

The plugin scans the file by itself. When it finishes you see the list of
components with type and version.

- **Version** comes from the component name (`Button v2.3.0`) or from the
  description (`Version: v2.3.0`).
- **Type** (Atom or Component) comes from the description (`Type: Atom`) or
  from the page / frame name.
- Pages like WIP, Annotations, Local components and the Organisational
  section are skipped.
- **Hide components without a version** is on by default. Untick it to see
  them.
- **Checkbox at the left of each row**: untick a component to leave it out
  of the table. **Include all** resets. This is remembered.
- A yellow box lists duplicate names. The JSON value is used for every
  component with that name.

**Change log.** If you keep a change log table on the canvas, click
**Find in file**. The plugin reads every "Change log Row" (name, version,
status, description, "Published on" date). Version lines in the component
description are read too. **Clear** forgets it.

**Other library files.** To add components from another file, for example
the atoms library: click **Set token**, paste a Figma personal access token
(Figma → Settings → Security → Personal access tokens, scope "File content:
read"), then paste the file link and click **Add**. Only published
components are listed. The token stays on your computer; the links are
remembered in the file.

## Step 2 – Upload

Drop one JSON file per brand: **COBA** and **Purple**. Each file holds the
platforms inside. Three formats work, also mixed:

```
"Badge": "v1.2.0"
"Badge": "v1.2.0", // Figma: 66:1117; APIs: CocoBadge
"Badge": { "version": "v1.2.0", "componentId": "66:1117", "api": "CocoBadge" }
```

- `null` or a missing name = Not Started. `"n/a"` = Not applicable.
- A `generic` block counts for both platforms unless `ios` or `android`
  has its own entry.
- `updatedAt` (optional) is shown above the table.

After both files are loaded:

- **Figma-IDs** shows how many ids the files contain, how many were found
  and how many not. Open "Show the … not found" to see them. An id is only
  valid in the file it came from; if many are missing, link that file in
  step 1.
- **Names not found in the library** is a list with a dropdown per name.
  Names with a working Figma-ID, and names that are 1:1 after cleaning
  (`DatePicker` = `Date Picker`), are mapped for you. Amber rows show a
  similar name: click **Use** to accept it. The rest stays on **Ignore**
  until you choose a component. Every choice is saved in the file.
- **Download mapping CSV** gives the dev team a table of JSON name, library
  component, match type, Figma id and code API. **Import mapping CSV**
  reads it back. **Re-apply Figma-IDs** replaces manual choices with the
  ids.

## Step 3 – Generate

Click **Generate table**. The table is placed on the current page. Running
it again replaces the old table in the same place.

- **Add change log sub-rows**: one line per version under each component.
- **Show the last N versions** (0 = all).

## Reading the table

| Symbol | Meaning |
| --- | --- |
| ● Implemented | the implemented version equals the library version |
| ◐ Update available, "on v1.2.0" | implemented, but an older version |
| ○ Not Started | no entry in the JSON |
| – Not applicable | the JSON says `n/a` |

Components with "purple" in the name get a light purple row. The caption at
the top shows the update date of each brand file and the day the table was
generated. **Go to Component →** jumps to the component, also in a linked
file.

## If something is off

- **A name is not matched**: check the Figma-ID list, then map it by hand
  in step 2 or ask the dev team to rename it.
- **The table is small or empty**: check the row checkboxes and the
  "Hide components without a version" option in step 1.
- **The change log is not found**: use **Find in file**, or select the
  change log section and click **Use selection**.
- **A linked file says "Access denied"**: check the token and that you can
  open that file.
