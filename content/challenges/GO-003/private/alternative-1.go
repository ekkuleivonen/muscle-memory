package accesslog

import "fmt"

// Entry is one line of the access log.
type Entry struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Status int    `json:"status"`
	Ms     int    `json:"ms"`
}

// ParseLine parses lines like "GET /cart 200 12ms".
func ParseLine(line string) Entry {
	var e Entry
	if _, err := fmt.Sscanf(line, "%s %s %d %dms", &e.Method, &e.Path, &e.Status, &e.Ms); err != nil {
		return Entry{}
	}
	return e
}
