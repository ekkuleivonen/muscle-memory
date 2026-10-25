<?php
// Mistake: rejects valid X check digit
function validIsbn(string $text): bool
{
    if (!preg_match("/^[0-9]{10}$/D", $text)) {
        return false;
    }
    $s = 0;
    for ($i = 0; $i < 10; $i++) {
        $s += (int) $text[$i] * (10 - $i);
    }
    return $s % 11 === 0;
}
