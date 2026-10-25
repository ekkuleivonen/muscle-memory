<?php

// array_filter drops every falsy piece, so the word "0" is not counted.
declare(strict_types=1);

/** The number of words in a post, as the composer shows it under the text box. */
function countWords(string $text): int
{
    return count(array_filter(preg_split('/\s+/', $text)));
}
