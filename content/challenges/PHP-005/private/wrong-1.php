<?php
// Mistake: checks format without checksum
function validIsbn(string $text): bool
{
    return preg_match("/^[0-9]{9}[0-9X]$/D", $text) === 1;
}
