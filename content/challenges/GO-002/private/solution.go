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
	perPage := positiveOr(values.Get("per_page"), 20)
	if perPage > 100 {
		perPage = 100
	}
	return Page{Page: positiveOr(values.Get("page"), 1), PerPage: perPage}
}

// positiveOr reads a positive whole number, or gives the fallback for anything else.
func positiveOr(text string, fallback int) int {
	n, err := strconv.Atoi(text)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
