# Workspace URLs are /w/<slug>. Turn a workspace name into its slug:
# lowercase ASCII letters and digits, words joined by single hyphens.
def slugify(name)
  words = []
  word = +""
  name.unicode_normalize(:nfd).each_char do |char|
    next if char.match?(/\p{Mn}/)

    char = char.downcase
    if char.match?(/\A[a-z0-9]\z/)
      word << char
    elsif !word.empty?
      words << word
      word = +""
    end
  end
  words << word unless word.empty?
  words.join("-")
end
