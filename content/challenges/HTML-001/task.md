The category page's filter form has two checkboxes, `in-stock` and `on-sale`, with bare text next to them. The accessibility audit flagged them: screen readers announce "checkbox" and nothing else, and clicking the text does not toggle the box.

Tie each checkbox to a label:

- Give each checkbox the id `filter-NAME`, where NAME is its `name`: `filter-in-stock` and `filter-on-sale`.
- Give each checkbox a `<label for="filter-NAME">` whose text is exactly its name.
- Keep both checkboxes, in the same order, with their `type` and `name` attributes, and keep everything inside the one `<form>`. The page has no other checkboxes or labels.

Each check runs a CSS selector against the page and reads something from the matching elements, in document order: their `count`, their `text`, their accessible `label`, or an attribute such as `name` or `id`.
