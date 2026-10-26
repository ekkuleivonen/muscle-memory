<?php
declare(strict_types=1);
// TODO: implement the task.

function validIsbn(string $text): bool
{
    if (strlen($text) !== 10) return false;
    $sum = 0;
    for ($i = 0; $i < 10; $i++) {
        $c = $text[$i];
        if ($i === 9 && $c === 'X') $value = 10;
        elseif ($c >= '0' && $c <= '9') $value = ord($c) - ord('0');
        else return false;
        $sum += $value * (10 - $i);
    }
    return $sum % 11 === 0;
}
