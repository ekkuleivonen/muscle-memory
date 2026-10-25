<?php
// Mistake: loses negative odd numbers
function evensFirst(array $values): array
{
    $even = [];
    $odd = [];
    foreach ($values as $v) {
        if ($v % 2 === 0) {
            $even[] = $v;
        } elseif ($v % 2 === 1) {
            $odd[] = $v;
        }
    }
    return array_merge($even, $odd);
}
