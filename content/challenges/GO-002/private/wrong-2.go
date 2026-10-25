// Falls back to both defaults when either value is bad, instead of each on its own.
package accounts

import (
	"net/url"
	"strconv"
)

// Page is the pagination requested by a list endpoint.
type Page struct {
	Page    int `json:"page"`
	PerPage int `json:"perPage"`
}

// ParsePage reads page and per_page from a URL query string, with defaults
// of page 1 and 20 per page, and per_page capped at 100.
func ParsePage(query string) Page {
	values, _ := url.ParseQuery(query)
	result := Page{Page: 1, PerPage: 20}
	if values.Has("page") {
		page, err := strconv.Atoi(values.Get("page"))
		if err != nil || page <= 0 {
			return Page{Page: 1, PerPage: 20}
		}
		result.Page = page
	}
	if values.Has("per_page") {
		perPage, err := strconv.Atoi(values.Get("per_page"))
		if err != nil || perPage <= 0 {
			return Page{Page: 1, PerPage: 20}
		}
		if perPage > 100 {
			perPage = 100
		}
		result.PerPage = perPage
	}
	return result
}
