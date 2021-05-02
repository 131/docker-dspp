Docker stack pre-processor



# Usage sample
```
stack -f production.yml compile
stack -f production.yml deploy

```
# Installation instruction
```
wget https://raw.githubusercontent.com/131/docker-stackmgr/master/stack -O /usr/bin/stack
sudo chmod +x /usr/bin/stack

# requires yq > 4.6
export  VERSION=v4.6.0 BINARY=yq_linux_amd64
sudo wget https://github.com/mikefarah/yq/releases/download/${VERSION}/${BINARY} -O /usr/bin/yq
sudo chmod +x /usr/bin/yq


# requires most colordiff

apt-get install most colordiff


```

# Credits
* [131](https://github.com/131)


