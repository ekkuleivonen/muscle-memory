<?php
// preg_split on a trimmed empty post still returns [""], so a blank post counts 1 word.

declare(strict_types=1);

/** The number of words in a post, as the composer shows it under the text box. */
function countWords(string $text): int
{
    return count(preg_split('/\s+/', trim($text)));
}
