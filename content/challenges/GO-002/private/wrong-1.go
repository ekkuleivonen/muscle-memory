// Only negative numbers fall back to the default, so page=0 and per_page=0 get through.
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
	page, err := strconv.Atoi(values.Get("page"))
	if err != nil || page < 0 {
		page = 1
	}
	perPage, err := strconv.Atoi(values.Get("per_page"))
	if err != nil || perPage < 0 {
		perPage = 20
	}
	if perPage > 100 {
		perPage = 100
	}
	return Page{Page: page, PerPage: perPage}
}
