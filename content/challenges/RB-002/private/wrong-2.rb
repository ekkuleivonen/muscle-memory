# Strips whitespace from the ends before slugging, so trailing punctuation still leaves a hyphen.
# Workspace URLs are /w/<slug>. Turn a workspace name into its slug:
# lowercase ASCII letters and digits, words joined by single hyphens.
def slugify(name)
  name.strip
      .unicode_normalize(:nfd)
      .gsub(/\p{Mn}/, "")
      .downcase
      .gsub(/[^a-z0-9]+/, "-")
end
