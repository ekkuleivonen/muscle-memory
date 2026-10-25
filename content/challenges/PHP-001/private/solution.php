<?php

declare(strict_types=1);

/** The number of words in a post, as the composer shows it under the text box. */
function countWords(string $text): int
{
    return count(preg_split('/\s+/', $text, -1, PREG_SPLIT_NO_EMPTY));
}
