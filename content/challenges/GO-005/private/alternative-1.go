package signup

import (
	"strings"
	"unicode"
)

// gmailDomains are the exact domains that deliver to Gmail, and the domain they become.
var gmailDomains = map[string]string{"gmail.com": "gmail.com", "googlemail.com": "gmail.com"}

// CanonicalEmail is the key sign-up looks accounts up by, so one person gets one account
// however they type their address. ok is false when raw is not an address we accept.
func CanonicalEmail(raw string) (string, bool) {
	email := strings.TrimSpace(raw)
	for _, r := range email {
		if unicode.IsSpace(r) {
			return "", false
		}
	}
	local, domain, found := strings.Cut(strings.ToLower(email), "@")
	if !found || strings.Contains(domain, "@") || local == "" || domain == "" {
		return "", false
	}
	if canonical, ok := gmailDomains[domain]; ok {
		local, _, _ = strings.Cut(local, "+")
		local = strings.Map(func(r rune) rune {
			if r == '.' {
				return -1
			}
			return r
		}, local)
		domain = canonical
		if local == "" {
			return "", false
		}
	}
	return local + "@" + domain, true
}
