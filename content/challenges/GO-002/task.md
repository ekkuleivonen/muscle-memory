The list endpoints accept any page size, and the mobile app sends `per_page=500` to fetch everything in one go. Cap it, don't reject it.

`ParsePage(query)` reads `page` and `per_page` from a URL query string without the leading `?`, such as `page=2&per_page=50`, and returns them as a `Page`.

- `page` defaults to 1 and `per_page` to 20.
- Each falls back to its default on its own when it is missing, empty, zero, negative or not a whole number.
- A `per_page` above 100 becomes 100. `page` has no upper limit.
- Parameter names are matched exactly, other parameters are ignored, and the order of parameters doesn't matter.
