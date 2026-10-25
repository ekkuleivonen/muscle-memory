# Splitting on /\s+/ keeps the empty string before leading whitespace and counts it as a word.
# The number of words in a post, as the composer shows it under the text box.
def count_words(text)
  text.split(/\s+/).length
end
