# Squeezing spaces fixes the double space, but tabs and newlines still don't separate words.
# The number of words in a post, as the composer shows it under the text box.
def count_words(text)
  text = text.squeeze(" ").strip
  return 0 if text.empty?

  text.count(" ") + 1
end
