<?php
declare(strict_types=1);
// TODO: implement the task.

function evensFirst(array $values): array
{
    $evens = [];
    $odds = [];
    foreach ($values as $value) {
        if ($value % 2 === 0) $evens[] = $value;
        else $odds[] = $value;
    }
    sort($evens);
    sort($odds);
    return array_merge($evens, $odds);
}
