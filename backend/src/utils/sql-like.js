// Escape LIKE wildcards so user search text is matched literally (MySQL default escape is "\").
const escapeLike = (value) => String(value ?? "").replace(/[\\%_]/g, (match) => `\\${match}`);
const containsPattern = (value) => `%${escapeLike(value)}%`;

module.exports = { containsPattern, escapeLike };
