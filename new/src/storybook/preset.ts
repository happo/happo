function managerEntries(entry = []) {
  return [...entry, require.resolve('./addon')];
}

function config(entry = []) {
  return [...entry, require.resolve('./decorator')];
}

module.exports = { managerEntries, config };
