# Portfolio

The rebuild of marekheiland.com, moving off Webflow.

- `site/`: the new site. `index.html` is the whole site in one file (Home, the four case
  studies, the Floorplanner personal project, Illustrations), with its images in `site/img` and the CV in `site/files`. The folder
  can be hosted anywhere as it is.
- `source/`: everything pulled from the old Webflow site. See `source/CONTENT.md`.
- `tools/`: small Node scripts with no dependencies.

## Commands

Run these from this folder.

- `node tools/serve.mjs`: serves the site on http://localhost:5180
- `node tools/build-site.mjs`: copies every image `site/index.html` references from
  `source/assets` into `site/img` (run it after adding an image to the page)
- `node tools/extract.mjs`: pulls the content from the saved Webflow pages again

Pages are addressed by hash: `#/`, `#/work/axis`, `#/work/hero-carousel`,
`#/work/design-system`, `#/work/recurring-schedule`, `#/projects/floorplanner`,
`#/illustrations`. The Floorplanner page embeds the live app from
https://mheiland17.github.io/FloorPlanner-app/ (deployed from the floorplanner repo), so it
always shows the latest deploy.
