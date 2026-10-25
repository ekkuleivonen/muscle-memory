// The path pattern allows only word characters, slashes, dots and dashes, so a path with a query string does not match.
package accesslog

import (
	"regexp"
	"strconv"
)

// Entry is one line of the access log.
type Entry struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Status int    `json:"status"`
	Ms     int    `json:"ms"`
}

var linePattern = regexp.MustCompile(`^([A-Z]+) ([\w/.-]+) (\d{3}) (\d+)ms$`)

// ParseLine parses lines like "GET /cart 200 12ms".
func ParseLine(line string) Entry {
	m := linePattern.FindStringSubmatch(line)
	if m == nil {
		return Entry{}
	}
	status, _ := strconv.Atoi(m[3])
	ms, _ := strconv.Atoi(m[4])
	return Entry{Method: m[1], Path: m[2], Status: status, Ms: ms}
}
