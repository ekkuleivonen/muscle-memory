import re


def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len(re.findall(r"\S+", text))
