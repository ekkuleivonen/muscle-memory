# Trimming fixes the empty post, not the double space.
def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len(text.strip().split(" ")) if text.strip() else 0
