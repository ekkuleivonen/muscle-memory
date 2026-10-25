<?php

declare(strict_types=1);

/** The number of words in a post, as the composer shows it under the text box. */
function countWords(string $text): int
{
    return substr_count($text, " ") + 1;
}
