<?php
declare(strict_types=1);
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
    return array_merge($even, $odd);
}
