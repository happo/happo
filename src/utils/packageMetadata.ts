import deterministicArchive, {
  type ArchiveResult,
} from './deterministicArchive.ts';

/**
 * A declared description of what a package contains and how it was resolved,
 * shipped alongside the package itself.
 *
 * Happo workers need to know which examples were filtered out before they
 * render anything: a worker that discovers a skip only after loading a story
 * has already paid for a page load, a framework boot and a render. Today the
 * only way for it to find out early is to read the `<script>` tags the client
 * writes into `iframe.html` for the *browser* to read -- which means scraping
 * an HTML document for data that was never meant for that, in one of two
 * different shapes depending on which integration produced the package.
 *
 * This file is the declared version of that: one place, one shape, aimed at
 * whoever reads the package rather than at whoever renders it. The inline
 * scripts stay where they are -- the browser-side code still reads them, and
 * every package built before this file existed still only has those.
 */

/** Filename at the root of the package. */
export const PACKAGE_METADATA_FILENAME = 'happo-metadata.json';

/**
 * Bumped when a consumer could get this wrong by assuming the old shape.
 * Adding an optional field doesn't need a bump; changing or removing one does.
 */
export const PACKAGE_METADATA_VERSION = 1;

export interface PackageMetadata {
  /** See `PACKAGE_METADATA_VERSION`. */
  version: number;

  /** Which integration produced the package. */
  integration: 'storybook' | 'custom';

  /**
   * Examples resolved out of this run, as component/variant names.
   *
   * Already resolved against the story index where there was one, so a
   * consumer can compare against names directly without re-deriving anything.
   * An entry with no `variant` covers every variant of that component.
   */
  skipped: Array<{ component: string; variant?: string }>;

  /**
   * Components this run was narrowed to, or null when it wasn't narrowed.
   *
   * Null and an empty array mean different things: null is "no filter", while
   * an empty array is "a filter that matched nothing", which is how a run ends
   * up rendering none of its own examples and borrowing them all from a
   * baseline.
   */
  only: Array<{ component: string }> | null;

  /**
   * How many snapshots this package is expected to produce, after `skipped`
   * and `only` have been applied.
   *
   * Omitted when there is no count, and also when there is one that does not
   * account for the filters -- a custom build reports its count before we
   * apply `skip`, and has no index for us to recompute it from. A reader can
   * therefore trust this or not have it, rather than having to know which
   * integration produced it.
   */
  estimatedSnapsCount?: number;
}

export function createPackageMetadata({
  integration,
  skipped,
  only,
  estimatedSnapsCount,
}: {
  integration: PackageMetadata['integration'];
  skipped?: Array<{ component: string; variant?: string }> | undefined;
  only?: Array<{ component: string }> | undefined;
  estimatedSnapsCount?: number | undefined;
}): PackageMetadata {
  const metadata: PackageMetadata = {
    version: PACKAGE_METADATA_VERSION,
    integration,
    skipped: skipped ?? [],
    only: only ?? null,
  };

  // `Number.isFinite` rather than a null check: JSON.stringify turns Infinity
  // and NaN into `null`, so shipping either would put a value in the file that
  // contradicts this module's own types and reads as a malformed count.
  if (estimatedSnapsCount !== undefined && Number.isFinite(estimatedSnapsCount)) {
    metadata.estimatedSnapsCount = estimatedSnapsCount;
  }

  return metadata;
}

/**
 * Archives a built package together with its metadata file.
 *
 * Exists as its own function so the thing that actually ships can be tested.
 * Reproducing these two calls in a test would prove only that the test can
 * build an archive, not that `preparePackage()` still puts the file in one.
 */
export async function archivePackageWithMetadata(
  packageDir: string,
  metadataInput: Parameters<typeof createPackageMetadata>[0],
): Promise<ArchiveResult & { metadata: PackageMetadata }> {
  const metadata = createPackageMetadata(metadataInput);

  const result = await deterministicArchive(
    [packageDir],
    [
      {
        name: PACKAGE_METADATA_FILENAME,
        content: JSON.stringify(metadata, null, 2),
        // This name is ours, and a reader trusts what is in it. A file of the
        // same name in the user's build output must not be shipped in its
        // place.
        overwrite: true,
      },
    ],
  );

  return { ...result, metadata };
}
