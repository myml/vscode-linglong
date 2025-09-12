package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetContents(t *testing.T) {
	assert := require.New(t)
	cList, err := getContents("amd64", "https://ci.deepin.com/repo/deepin/deepin-community/backup/rc2", "beige", "main")
	assert.NoError(err)
	var pkgName string
	for i := range cList {
		if strings.HasSuffix(cList[i].Path, "libcurl.so.4") {
			pkgName = cList[i].Package
			break
		}
	}
	assert.Equal(pkgName, "libcurl4")
}
