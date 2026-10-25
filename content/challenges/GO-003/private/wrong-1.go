// Strips every "ms" from the line before splitting it, so a path containing "ms" is changed too.
package accesslog

import (
	"strconv"
	"strings"
)

// Entry is one line of the access log.
type Entry struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Status int    `json:"status"`
	Ms     int    `json:"ms"`
}

// ParseLine parses lines like "GET /cart 200 12ms".
func ParseLine(line string) Entry {
	fields := strings.Fields(strings.ReplaceAll(line, "ms", ""))
	if len(fields) != 4 {
		return Entry{}
	}
	status, _ := strconv.Atoi(fields[2])
	ms, _ := strconv.Atoi(fields[3])
	return Entry{Method: fields[0], Path: fields[1], Status: status, Ms: ms}
}
