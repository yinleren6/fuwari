<script lang="ts">
	export let icon: string = "";
	let className: string = "";
	export { className as class };
	export let width: string | number = "1em";
	export let height: string | number = "1em";
	export let style: string = "";

	// 解析图标名称，格式：collection:icon-name
	const [collection, iconName] = icon.includes(':') ? icon.split(':', 2) : ['', icon];
	
	// Iconify CDN URL
	const iconifyUrl = `https://api.iconify.design/${collection}/${iconName}.svg`;
	
	// 合并样式
	const combinedStyle = `
		display: inline-block;
		width: ${typeof width === 'number' ? width + 'px' : width};
		height: ${typeof height === 'number' ? height + 'px' : height};
		background-color: currentColor;
		mask-image: url('${iconifyUrl}');
		mask-size: contain;
		mask-repeat: no-repeat;
		mask-position: center;
		-webkit-mask-image: url('${iconifyUrl}');
		-webkit-mask-size: contain;
		-webkit-mask-repeat: no-repeat;
		-webkit-mask-position: center;
		vertical-align: -0.125em;
		${style}
	`.trim();
</script>

<span 
	class={className}
	data-icon={icon}
	style={combinedStyle}
	{...$$restProps}
></span>
