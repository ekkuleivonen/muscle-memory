<?php
declare(strict_types=1);
function validIsbn(string $text): bool
{
    if (strlen($text) !== 10) {
        return false;
    }
    $sum = 0;
    foreach (str_split($text) as $i => $c) {
        if ($c === "X" && $i === 9) {
            $n = 10;
        } elseif ($c >= "0" && $c <= "9") {
            $n = (int) $c;
        } else {
            return false;
        }
        $sum += ($i + 1) * $n;
    }
    return $sum % 11 === 0;
}
