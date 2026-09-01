package update

import (
	"strconv"
	"strings"
)

// By precedence, not publication date: a hotfix publishes after a beta but ranks below it.
func newer(a, b string) bool { return compareVersions(a, b) > 0 }

func compareVersions(a, b string) int {
	aCore, aPre := splitVersion(a)
	bCore, bPre := splitVersion(b)

	for i := 0; i < 3; i++ {
		if diff := aCore[i] - bCore[i]; diff != 0 {
			if diff > 0 {
				return 1
			}
			return -1
		}
	}

	// A release with no prerelease outranks any prerelease of the same core.
	switch {
	case aPre == "" && bPre == "":
		return 0
	case aPre == "":
		return 1
	case bPre == "":
		return -1
	}
	return comparePrerelease(strings.Split(aPre, "."), strings.Split(bPre, "."))
}

func comparePrerelease(a, b []string) int {
	for i := 0; i < len(a) && i < len(b); i++ {
		aNum, aErr := strconv.Atoi(a[i])
		bNum, bErr := strconv.Atoi(b[i])

		switch {
		case aErr == nil && bErr == nil:
			if aNum != bNum {
				if aNum > bNum {
					return 1
				}
				return -1
			}
		case aErr == nil:
			// Numeric identifiers always rank below alphanumeric ones.
			return -1
		case bErr == nil:
			return 1
		default:
			if cmp := strings.Compare(a[i], b[i]); cmp != 0 {
				return cmp
			}
		}
	}

	// A longer prerelease outranks its own prefix: beta.1.1 beats beta.1.
	switch {
	case len(a) > len(b):
		return 1
	case len(a) < len(b):
		return -1
	}
	return 0
}

func splitVersion(tag string) ([3]int, string) {
	tag = strings.TrimPrefix(strings.TrimSpace(tag), "v")

	var pre string
	if idx := strings.IndexAny(tag, "-+"); idx >= 0 {
		if tag[idx] == '-' {
			pre, _, _ = strings.Cut(tag[idx+1:], "+")
		}
		tag = tag[:idx]
	}

	var core [3]int
	for i, part := range strings.SplitN(tag, ".", 3) {
		if i > 2 {
			break
		}
		core[i], _ = strconv.Atoi(part)
	}
	return core, pre
}
