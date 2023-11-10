This is an example on how to use Deno with cdk8s to simplify manifest packaging.

To run it easily (if you don't have Deno installed) with docker run the following command:
```sh
docker run -v $PWD:/app -v cache:/cache -e DENO_DIR=/cache -w /app -u $(id -u):$(id -g) -t denoland/deno:1.38.1 run --allow-read --allow-write /app/main.ts --config config.json
```

The output manifests will be in `dist/` as per cdk8s convention.

To import CRDs get them from upstream or pull them from the cluster and process them with cdk8s cli, they're commited in this directory so you don't
need to run this to see how this example works.
```sh
# argo rollouts crds
npx cdk8s import argo-rollouts:=rollout-crd.yaml
# import generic kubernerets crds
npx cdk8s import
```

We can then compile this to a binary to provide to people, just run the following:
```sh
docker run -v $PWD:/app -v cache:/cache -e DENO_DIR=/cache -w /app -u $(id -u):$(id -g) -t denoland/deno:1.38.1 compile --allow-read --allow-write /app/main.ts
```
this can be switched to cross compile by providing `--target`

After this you should have a binary called `app` in this directory.
Just execute `./app --config config.json` and you'll see a `dist/` directory with the manifests being ready.

This provides a pretty hefty binary 149M currently, we can reduce this by using `gzexe` (`upx` compressed binaries seem to segfault).  
`gzexe app` brings it down to 49M
