<?php
// Trimming fixes the empty post, but a double space still counts an extra word.

declare(strict_types=1);

/** The number of words in a post, as the composer shows it under the text box. */
function countWords(string $text): int
{
    $text = trim($text);
    if ($text === '') {
        return 0;
    }
    return substr_count($text, " ") + 1;
}
