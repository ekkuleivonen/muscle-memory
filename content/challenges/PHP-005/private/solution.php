<?php
declare(strict_types=1);
function validIsbn(string $text): bool
{
    if (!preg_match("/^[0-9]{9}[0-9X]$/D", $text)) {
        return false;
    }
    $sum = 0;
    for ($i = 0; $i < 10; $i++) {
        $sum += ($text[$i] === "X" ? 10 : (int) $text[$i]) * (10 - $i);
    }
    return $sum % 11 === 0;
}
