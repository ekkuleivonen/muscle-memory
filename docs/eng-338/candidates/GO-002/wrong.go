package accounts

import (
 "net/url"
 "strconv"
)

// Page is the pagination requested by a list endpoint.
type Page struct {
 Page int `json:"page"`
 PerPage int `json:"perPage"`
}

// ParsePage reads page and per_page from a URL query string, with defaults
// of page 1 and 20 per page, and per_page capped at 100.
func ParsePage(query string) Page {
 values, _ := url.ParseQuery(query)
 result := Page{Page: 1, PerPage: 20}
 if n, err := strconv.Atoi(values.Get("page")); err == nil && n > 0 { result.Page = n }
 if n, err := strconv.Atoi(values.Get("per_page")); err == nil && n > 0 {
  if n > 100 { n = 20 }
  result.PerPage = n
 }
 return result
}
