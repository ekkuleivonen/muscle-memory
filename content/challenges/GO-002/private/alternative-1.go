package accounts

import (
	"strconv"
	"strings"
)

// Page is the pagination requested by a list endpoint.
type Page struct {
	Page    int `json:"page"`
	PerPage int `json:"perPage"`
}

// ParsePage reads page and per_page from a URL query string, with defaults
// of page 1 and 20 per page, and per_page capped at 100.
func ParsePage(query string) Page {
	result := Page{Page: 1, PerPage: 20}
	seen := map[string]bool{}
	for _, pair := range strings.Split(query, "&") {
		name, value, _ := strings.Cut(pair, "=")
		if seen[name] {
			continue // the first occurrence wins
		}
		seen[name] = true
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 {
			continue
		}
		switch name {
		case "page":
			result.Page = n
		case "per_page":
			if n > 100 {
				n = 100
			}
			result.PerPage = n
		}
	}
	return result
}
