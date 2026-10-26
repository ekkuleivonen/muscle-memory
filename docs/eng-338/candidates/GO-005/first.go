package signup

import (
 "strings"
 "unicode"
)

// CanonicalEmail is the key sign-up looks accounts up by, so one person gets one account
// however they type their address. ok is false when raw is not an address we accept.
func CanonicalEmail(raw string) (string, bool) {
 email := strings.TrimSpace(raw)
 if strings.IndexFunc(email, unicode.IsSpace) >= 0 || strings.Count(email, "@") != 1 { return "", false }
 email = strings.ToLower(email)
 parts := strings.SplitN(email, "@", 2)
 local, domain := parts[0], parts[1]
 if local == "" || domain == "" { return "", false }
 if domain == "gmail.com" || domain == "googlemail.com" {
  if plus := strings.Index(local, "+"); plus >= 0 { local = local[:plus] }
  local = strings.ReplaceAll(local, ".", "")
  domain = "gmail.com"
 }
 if local == "" { return "", false }
 return local + "@" + domain, true
}
