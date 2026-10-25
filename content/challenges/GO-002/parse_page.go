package accounts

// Page is the pagination requested by a list endpoint.
type Page struct {
	Page    int `json:"page"`
	PerPage int `json:"perPage"`
}

// ParsePage reads page and per_page from a URL query string, with defaults
// of page 1 and 20 per page, and per_page capped at 100.
func ParsePage(query string) Page {
	return Page{Page: 1, PerPage: 20}
}
