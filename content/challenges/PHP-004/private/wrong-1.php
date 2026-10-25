<?php
// Mistake: sorts the groups
function evensFirst(array $values): array
{
    $even = [];
    $odd = [];
    foreach ($values as $v) {
        if ($v % 2 === 0) {
            $even[] = $v;
        } else {
            $odd[] = $v;
        }
    }
    sort($even);
    sort($odd);
    return array_merge($even, $odd);
}
